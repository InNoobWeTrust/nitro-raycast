import { LocalStorage, environment } from "@raycast/api";
import { LlmModel, Store } from "./types";
import { disposerFactory } from "./utils";
import { BehaviorSubject, Observable, Subject, Subscription, shareReplay, tap } from "rxjs";
import { downloader } from "./downloader";
import path from "node:path";

const MODEL_CONFIGS_PATH = path.join(environment.assetsPath, "models");
const MODELS_PATH = path.join(environment.supportPath, "models");

const LLM_MODEL_CONFIG_STORAGE_KEY = "llm-model";

const llmModelStore: Store<LlmModel> & {
  setConfig: (newConfig: Partial<LlmModel>) => Subject<number>;
} = {
  subject: new BehaviorSubject<LlmModel>({
    source_url: "https://huggingface.co/Qwen/Qwen1.5-0.5B-Chat-GGUF/resolve/main/qwen1_5-0_5b-chat-q2_k.gguf",
    id: "qwen1_5-0_5b-chat-q2_k",
    name: "Qwen Chat 1.5 0.5B Q2_K",
    settings: {
      ctx_len: 50,
      ngl: 32,
      prompt_template:
        "<|im_start|>system\n{system_message}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant",
    },
  }),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
  },
  init: async () => {
    // Load config
    const configRaw = await LocalStorage.getItem<string>(LLM_MODEL_CONFIG_STORAGE_KEY);
    if (configRaw) llmModelStore.subject.next(JSON.parse(configRaw));
    // Subscribe to changes in runtime config and save to local storage
    llmModelStore.selfSubscription.autoSave = llmModelStore.subject.subscribe((config) => {
      LocalStorage.setItem(LLM_MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config));
    });
    // Set status ready
    llmModelStore.status.ready.next(true);
  },
  [Symbol.asyncDispose]: async () => {
    await disposerFactory(llmModelStore)();
  },
  setConfig: (newConfig: Partial<LlmModel>): Subject<number> => {
    const mergedConfig = {
      ...llmModelStore.subject.getValue(),
      ...newConfig,
    };
    // Before downloading, set status ready to false
    llmModelStore.status.ready.next(false);
    // Progress report subject
    const progress$ = new Subject<number>();
    // Try to download model if it's not already downloaded
    const _sub = downloader(
      mergedConfig.source_url,
      path.join(MODELS_PATH, mergedConfig.id),
      new Subject<void>(),
    ).subscribe({
      next: (progress) => progress$.next(progress),
      complete: () => {
        llmModelStore.subject.next(mergedConfig);
        llmModelStore.status.ready.next(true);
        progress$.complete();
      },
      error: (e) => {
        progress$.error(e);
        llmModelStore.status.ready.next(true);
      },
    });
    // Return progress subject to allow progress reporting
    return progress$;
  },
};

export { llmModelStore };
