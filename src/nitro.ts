import { LocalStorage, environment } from "@raycast/api";
import { useEffect } from "react";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { BehaviorSubject, Subscription } from "rxjs";

import { initialize, setBinPath, runModel, killSubprocess, chatCompletion } from "@janhq/nitro-node";

const CHAT_STORAGE_KEY = "chat-history";
const CONFIG_STORAGE_KEY = "nitro-config";
const BIN_PATH = path.join(environment.supportPath, "bin");

interface Store<T> {
  subject: BehaviorSubject<T>;
  status: Record<string, BehaviorSubject<boolean>>;
  selfSubscription: Record<string, Subscription>;
  init: () => Promise<void>;
  dispose?: () => Promise<void>;
}
const disposerFactory =
  <T>(store: Store<T>) =>
    async () => {
      for await (const sub of Object.values(store.selfSubscription)) {
        sub.unsubscribe();
      }
    };

interface NitroConfig {
  model: string;
  max_tokens: number;
  stop: string[];
  frequency_penalty: number;
  presence_penalty: number;
  temperature: number;
  top_p: number;
  context_length: number;
}

export const configStore: Store<NitroConfig> & {
  setConfig: (newConfig: Partial<NitroConfig>) => void;
} = {
  subject: new BehaviorSubject<NitroConfig>({
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
    if (configRaw) configStore.subject.next(JSON.parse(configRaw));
    // Subscribe to changes in runtime config and save to local storage
    configStore.selfSubscription.autoSave = configStore.subject.subscribe({
      next: (config) => {
        LocalStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      },
    });
    // Set status ready
    configStore.status.ready.next(true);
    // Set disposer
    configStore.dispose = disposerFactory(configStore);
  },
  setConfig: (newConfig: Partial<NitroConfig>) => {
    configStore.subject.next({
      ...configStore.subject.getValue(),
      ...newConfig,
    });
  },
};

type Chat = {
  role: "assistant" | "user";
  content: string;
}[];
export const chatStore: Store<Chat> & {
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
  init: async () => {
    // Init chat history from previous session
    const storedChatJson = await LocalStorage.getItem<string>(CHAT_STORAGE_KEY);
    const initialChat = storedChatJson
      ? JSON.parse(storedChatJson)
      : [
        {
          content:
            "You are a good productivity assistant. You help user with what they are asking in Markdown format . For responses that contain code, you must use ``` with the appropriate coding language to help display the code to user correctly.",
          role: "assistent",
        },
      ];
    chatStore.subject.next(initialChat);
    // Store chat history on change
    chatStore.selfSubscription.autoSave = chatStore.subject.subscribe({
      next: (chats) => {
        LocalStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
      },
    });
    // After init, set ready status
    chatStore.status.ready.next(true);
    // Set disposer
    chatStore.dispose = disposerFactory(chatStore);
  },
  reset: () => {
    chatStore.subject.next([]);
  },
  requestCompletion: async (msg: string) => {
    chatStore.status.busy.next(true);
    chatStore.subject.next([
      ...chatStore.subject.getValue(),
      {
        content: msg,
        role: "user",
      },
    ]);
    const response = await chatCompletion({
      ...configStore.subject.getValue(),
      messages: chatStore.subject.getValue(),
    });
    const reply = (await response.json()) as { choices: { message: { content: string } }[] };
    console.log(JSON.stringify(reply.choices[0]?.message?.content));
    chatStore.subject.next([
      ...chatStore.subject.getValue(),
      {
        content: reply.choices[0]?.message?.content || "Error",
        role: "assistant",
      },
    ]);
    chatStore.status.busy.next(false);
  },
};

interface ModelConfig {
  modelPath: string;
  promptTemplate: string;
}

export const nitroManager: Store<ModelConfig> = {
  subject: new BehaviorSubject<ModelConfig>({
    modelPath: path.join(os.homedir(), "jan", "models", "tinyllama-1.1b"),
    promptTemplate: "<|system|>\n{system_message}<|user|>\n{prompt}<|assistant|>",
  }),
  status: {
    ready: new BehaviorSubject<boolean>(false),
  },
  selfSubscription: {
    autorestart: new Subscription(),
  },
  init: async () => {
    await configStore.init();
    await chatStore.init();
    await fs.mkdir(BIN_PATH, { recursive: true });
    await initialize();
    await setBinPath(path.join(environment.supportPath, "bin"));
    await runModel(nitroManager.subject.getValue());
    // After nitro is ran, init chat storage
    // Set run status
    nitroManager.status.ready.next(true);
    // Monitor nitro and restart if it's not running anymore
  },
  dispose: async () => {
    await configStore.dispose!();
    await chatStore.dispose!();
    await killSubprocess();
    // Set statuses
    nitroManager.status.ready.next(false);
  },
};

export const useNitro = () => {
  useEffect(() => {
    nitroManager.init();
    return () => {
      nitroManager.dispose!();
    };
  }, []);
};
