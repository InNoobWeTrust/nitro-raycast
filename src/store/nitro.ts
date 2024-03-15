import { LocalStorage, environment } from "@raycast/api";
import path from "node:path";
import fs from "node:fs/promises";
import { BehaviorSubject, Subscription, filter, first, shareReplay, timer, combineLatest, map } from "rxjs";

import {
  initialize,
  setBinPath,
  setLogger,
  registerEventHandler,
  runModel,
  killSubprocess,
  NitroModelInitOptions,
} from "@janhq/nitro-node";
import { Chat, Store } from "../types";
import { disposerFactory } from "../utils";
import { MODELS_PATH, llmModelRegistry, llmModelStore } from "./llm-model";
import OpenAI from "openai";

const CHAT_STORAGE_KEY = "chat-history";
const BIN_PATH = path.join(environment.supportPath, "bin");

const llmClient: Store<OpenAI> = {
  subject: new BehaviorSubject<OpenAI>(
    new OpenAI({
      apiKey: "",
      baseURL: "http://127.0.0.1:3928/v1",
    }),
  ),
  status: {},
  selfSubscription: {},
  init: async () => {
    // Do nothing
  },
  [Symbol.asyncDispose]: async () => {
    // Do nothing
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
    const initialChat =
      storedChatJson && storedChatJson.trim().length ? JSON.parse(storedChatJson) : [chatHistoryStore.systemPrompt];
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
    if (!chatHistoryStore.status.ready.getValue()) throw Error("History store not ready");
    console.warn("Reset chat history");
    // Set status not ready before altering chat history
    chatHistoryStore.status.ready.next(false);
    // Reset chat history
    chatHistoryStore.subject.next([chatHistoryStore.systemPrompt]);
    // Back to ready
    chatHistoryStore.status.ready.next(true);
  },
  requestCompletion: async (msg?: string) => {
    // Wait for ready status
    await chatHistoryStore.status.ready.pipe(filter(Boolean), first()).toPromise();
    // Set status not ready before sending request
    chatHistoryStore.status.ready.next(false);
    const chats = chatHistoryStore.subject.getValue();
    if (msg) {
      chats.push({
        content: msg,
        role: "user",
      });
      chatHistoryStore.subject.next(chats);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { stream, ...params } = llmModelStore.subject.getValue()!.parameters;

      let reply = "";
      if (stream) {
        const response = llmClient.subject.getValue().beta.chat.completions.stream({
          ...params,
          model: "gpt-4",
          messages: chats,
        });
        for await (const part of response) {
          reply += part.choices?.[0]?.delta?.content ?? "";
          // Stream temporary reply
          chatHistoryStore.subject.next([
            ...chats,
            {
              role: "assistant",
              content: reply,
            },
          ]);
        }
      } else {
        const response = await llmClient.subject.getValue().chat.completions.create({
          ...params,
          model: "gpt-4",
          messages: chats,
          stream: false,
        });
        reply = response.choices?.[0]!.message?.content ?? "";
      }

      chats.push({
        role: "assistant",
        content: reply,
      });
      chatHistoryStore.subject.next(chats);
    } finally {
      chatHistoryStore.status.ready.next(true);
    }
  },
};

const nitroManager: Store<Omit<NitroModelInitOptions, "modelPath">> & {
  restart: () => Promise<void>;
} = {
  subject: new BehaviorSubject<Omit<NitroModelInitOptions, "modelPath">>({
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
        // Wait 500ms before setting ready status
        timer(500).subscribe(() => nitroManager.status.ready.next(true));
      },
    });
    // Monitor nitro and restart if it's not running
    nitroManager.selfSubscription.autorestart = combineLatest(
      llmModelStore.subject.pipe(shareReplay(1)),
      llmModelRegistry.modelDownloadedStatus.pipe(shareReplay(1)),
      nitroManager.status.ready.pipe(shareReplay(1)),
    )
      .pipe(
        map(
          // Ensure everything is ready and model is downloaded
          ([model, downloadedStatus, ready]) => ({ model, ready, modelReady: model && downloadedStatus[model.id] }),
        ),
      )
      .subscribe(async ({ model, ready, modelReady }) => {
        if (!ready && modelReady) {
          await runModel({
            ...nitroManager.subject.getValue(),
            modelPath: path.join(MODELS_PATH, model!.id),
            ...model?.settings,
          });
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
    await chatHistoryStore[Symbol.asyncDispose]();
  },
};

export { chatHistoryStore, nitroManager };
