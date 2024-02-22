import { LocalStorage, environment } from "@raycast/api";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { BehaviorSubject, Subscription, combineLatest, filter, first, map, shareReplay } from "rxjs";

import {
  initialize,
  setBinPath,
  setLogger,
  registerEventHandler,
  runModel,
  killSubprocess,
  chatCompletion,
  NitroModelInitOptions,
} from "@janhq/nitro-node";
import { useEffect, useState } from "react";
import { Chat, NitroChatConfig, Store } from "./types";

const CHAT_STORAGE_KEY = "chat-history";
const CONFIG_STORAGE_KEY = "nitro-config";
const BIN_PATH = path.join(environment.supportPath, "bin");

const disposerFactory =
  <T>(store: Store<T>) =>
  async () => {
    for await (const sub of Object.values(store.selfSubscription)) {
      sub.unsubscribe();
    }
  };

const chatConfigStore: Store<NitroChatConfig> & {
  setConfig: (newConfig: Partial<NitroChatConfig>) => void;
} = {
  subject: new BehaviorSubject<NitroChatConfig>({
    model: "gpt-3.5-turbo",
    max_tokens: 2048,
    stop: [],
    frequency_penalty: 0,
    presence_penalty: 0,
    temperature: 0.7,
    top_p: 0.95,
    context_length: 4096,
  }),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
  },
  init: async () => {
    // Load config
    const configRaw = await LocalStorage.getItem<string>(CONFIG_STORAGE_KEY);
    if (configRaw) chatConfigStore.subject.next(JSON.parse(configRaw));
    // Subscribe to changes in runtime config and save to local storage
    chatConfigStore.selfSubscription.autoSave = chatConfigStore.subject.subscribe((config) => {
      LocalStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    });
    // Set status ready
    chatConfigStore.status.ready.next(true);
  },
  [Symbol.asyncDispose]: async () => {
    await disposerFactory(chatConfigStore)();
  },
  setConfig: (newConfig: Partial<NitroChatConfig>) => {
    chatConfigStore.subject.next({
      ...chatConfigStore.subject.getValue(),
      ...newConfig,
    });
  },
};

const chatHistoryStore: Store<Chat> & {
  systemPrompt: { role: "system"; content: string };
  reset: () => void;
  requestCompletion: (msg?: string) => Promise<void>;
} = {
  subject: new BehaviorSubject<Chat>([]),
  status: {
    ready: new BehaviorSubject<boolean>(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
  },
  systemPrompt: {
    content: "You are a good assistant.",
    role: "system",
  },
  init: async () => {
    // Init chat history from previous session
    const storedChatJson = await LocalStorage.getItem<string>(CHAT_STORAGE_KEY);
    const initialChat = storedChatJson ? JSON.parse(storedChatJson) : [chatHistoryStore.systemPrompt];
    chatHistoryStore.subject.next(initialChat);
    // Store chat history on change
    chatHistoryStore.selfSubscription.autoSave = chatHistoryStore.subject.subscribe({
      next: (chats) => {
        LocalStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
      },
    });
    // After init, set ready status
    chatHistoryStore.status.ready.next(true);
  },
  [Symbol.asyncDispose]: async () => {
    await disposerFactory(chatHistoryStore)();
  },
  reset: () => {
    // Only reset if ready
    if (!chatHistoryStore.status.ready.getValue()) throw new Error("History store not ready");
    // Reset chat history
    chatHistoryStore.subject.next([chatHistoryStore.systemPrompt]);
  },
  requestCompletion: async (msg?: string) => {
    chatHistoryStore.status.ready.next(false);
    if (msg) {
      chatHistoryStore.subject.next([
        ...chatHistoryStore.subject.getValue(),
        {
          content: msg,
          role: "user",
        },
      ]);
    }
    try {
      const response = await chatCompletion({
        ...chatConfigStore.subject.getValue(),
        messages: chatHistoryStore.subject.getValue(),
      });
      const reply = (await response.json()) as { choices: { message: { content: string } }[] };
      console.log(JSON.stringify(reply?.choices?.[0]?.message?.content));
      chatHistoryStore.subject.next([
        ...chatHistoryStore.subject.getValue(),
        {
          content: reply?.choices?.[0]?.message?.content,
          role: "assistant",
        },
      ]);
    } finally {
      chatHistoryStore.status.ready.next(true);
    }
  },
};

const nitroManager: Store<NitroModelInitOptions> & {
  restart: () => Promise<void>;
} = {
  subject: new BehaviorSubject<NitroModelInitOptions>({
    modelPath: path.join(os.homedir(), "jan", "models", "tinyllama-1.1b"),
    promptTemplate: "<|system|>\n{system_message}<|user|>\n{prompt}<|assistant|>",
    ctx_len: 50,
    ngl: 32,
    cont_batching: false,
    embedding: false,
    cpu_threads: -1,
  }),
  status: {
    ready: new BehaviorSubject<boolean>(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
    autorestart: new Subscription(),
  },
  restart: async () => {
    // Manually kill nitro
    await killSubprocess();
    // Wait for ready
    await new Promise((resolve) => {
      nitroManager.status.ready.pipe(filter(Boolean), first()).subscribe(resolve);
    });
  },
  init: async () => {
    await fs.mkdir(BIN_PATH, { recursive: true });
    await initialize();
    await setBinPath(path.join(environment.supportPath, "bin"));
    await setLogger(console.log);
    registerEventHandler({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      close: (code: number, signal: string) => {
        nitroManager.status.ready.next(false);
      },
      disconnect: () => {
        nitroManager.status.ready.next(false);
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      exit: (code: number, signal: string) => {
        nitroManager.status.ready.next(false);
      },
      spawn: () => {
        nitroManager.status.ready.next(true);
      },
    });
    // Monitor nitro and restart if it's not running
    nitroManager.selfSubscription.autorestart = nitroManager.status.ready
      .pipe(
        // Trigger first start
        shareReplay(1),
      )
      .subscribe(async (ready) => {
        if (!ready) {
          await runModel(nitroManager.subject.getValue());
          // Re-evaluate last message if not yet answered
          if (chatHistoryStore.subject.getValue().pop()?.role === "user") {
            await chatHistoryStore.requestCompletion();
          }
        }
      });
  },
  [Symbol.asyncDispose]: async () => {
    // Dispose all subscriptions => No more autorestart
    await disposerFactory(nitroManager)();
    // Kill nitro, which will also set ready status to false
    await killSubprocess();
    await chatConfigStore[Symbol.asyncDispose]();
    await chatHistoryStore[Symbol.asyncDispose]();
  },
};

const useNitro = () => {
  // Combined busy status
  const busy$ = combineLatest([
    chatConfigStore.status.ready.pipe(shareReplay(1)),
    chatHistoryStore.status.ready.pipe(shareReplay(1)),
    nitroManager.status.ready.pipe(shareReplay(1)),
  ]).pipe(map(([configReady, historyReady, nitroReady]) => !(configReady && historyReady && nitroReady)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Init storages
    Promise.resolve()
      .then(
        // Init config
        chatConfigStore.init,
      )
      .then(
        // Init chat history
        chatHistoryStore.init,
      )
      .then(
        // Init nitro
        nitroManager.init,
      );
    // Subscribe busy status
    const sub = busy$.subscribe(setBusy);

    return () => {
      sub.unsubscribe();
      nitroManager[Symbol.asyncDispose]();
    };
  }, []);

  return { busy };
};

export { chatConfigStore, chatHistoryStore, nitroManager, useNitro };
