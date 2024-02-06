import { LocalStorage, environment } from "@raycast/api";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { BehaviorSubject, Subscription } from "rxjs";

import {
  initialize,
  setBinPath,
  runModel,
  killSubprocess,
  chatCompletion,
  NitroModelInitOptions,
} from "@janhq/nitro-node";
import { useEffect } from "react";

const CHAT_STORAGE_KEY = "chat-history";
const CONFIG_STORAGE_KEY = "nitro-config";
const BIN_PATH = path.join(environment.supportPath, "bin");

interface Store<T> extends AsyncDisposable {
  subject: BehaviorSubject<T>;
  status: Record<string, BehaviorSubject<boolean>>;
  selfSubscription: Record<string, Subscription>;
  init: () => Promise<void>;
}
const disposerFactory =
  <T>(store: Store<T>) =>
  async () => {
    for await (const sub of Object.values(store.selfSubscription)) {
      sub.unsubscribe();
    }
  };

interface NitroChatConfig {
  model: string;
  max_tokens: number;
  stop: string[];
  frequency_penalty: number;
  presence_penalty: number;
  temperature: number;
  top_p: number;
  context_length: number;
}

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
    chatConfigStore.selfSubscription.autoSave = chatConfigStore.subject.subscribe({
      next: (config) => {
        LocalStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      },
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

type Chat = {
  role: "assistant" | "user";
  content: string;
}[];
const chatHistoryStore: Store<Chat> & {
  systemPrompt: { role: "assistant"; content: string };
  reset: () => void;
  requestCompletion: (msg: string) => Promise<void>;
} = {
  subject: new BehaviorSubject<Chat>([]),
  status: {
    ready: new BehaviorSubject<boolean>(false),
    busy: new BehaviorSubject<boolean>(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
  },
  systemPrompt: {
    content:
      "You are a good productivity assistant. You help user with what they are asking in Markdown format . For responses that contain code, you must use ``` with the appropriate coding language to help display the code to user correctly.",
    role: "assistant",
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
    chatHistoryStore.subject.next([chatHistoryStore.systemPrompt]);
  },
  requestCompletion: async (msg: string) => {
    chatHistoryStore.status.busy.next(true);
    chatHistoryStore.subject.next([
      ...chatHistoryStore.subject.getValue(),
      {
        content: msg,
        role: "user",
      },
    ]);
    const response = await chatCompletion({
      ...chatConfigStore.subject.getValue(),
      messages: chatHistoryStore.subject.getValue(),
    });
    const reply = (await response.json()) as { choices: { message: { content: string } }[] };
    console.log(JSON.stringify(reply.choices[0]?.message?.content));
    chatHistoryStore.subject.next([
      ...chatHistoryStore.subject.getValue(),
      {
        content: reply.choices[0]?.message?.content || "Error",
        role: "assistant",
      },
    ]);
    chatHistoryStore.status.busy.next(false);
  },
};

const nitroManager: Store<NitroModelInitOptions> = {
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
  init: async () => {
    // Init chat storage first to display history
    await chatConfigStore.init();
    await chatHistoryStore.init();
    await fs.mkdir(BIN_PATH, { recursive: true });
    await initialize();
    await setBinPath(path.join(environment.supportPath, "bin"));
    await runModel(nitroManager.subject.getValue());
    // Set run status
    nitroManager.status.ready.next(true);
    // Monitor nitro and restart if it's not running anymore
    nitroManager.selfSubscription.autorestart = nitroManager.status.ready.subscribe({
      next: async (ready) => {
        if (!ready) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          runModel(nitroManager.subject.getValue());
        }
      },
    });
  },
  [Symbol.asyncDispose]: async () => {
    // Dispose all subscriptions
    await disposerFactory(nitroManager)();
    // Set statuses for UI display (if there is any)
    nitroManager.status.ready.next(false);
    await chatConfigStore[Symbol.asyncDispose]();
    await chatHistoryStore[Symbol.asyncDispose]();
    await killSubprocess();
  },
};

const useNitro = () => {
  useEffect(() => {
    nitroManager.init();
    return () => {
      nitroManager[Symbol.asyncDispose]();
    };
  }, []);
};

export { chatConfigStore, chatHistoryStore, nitroManager, useNitro };
