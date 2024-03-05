import { LocalStorage, environment } from "@raycast/api";
import { BehaviorSubject, Subject, Subscription, concat, interval, of, shareReplay } from "rxjs";
import path from "node:path";
import fs from "node:fs";
import { useEffect, useState } from "react";
import { LlmModel, Store } from "../types";
import { disposerFactory } from "../utils";
import { download } from "../action";

const MODEL_CONFIGS_PATH = path.join(environment.assetsPath, "models");
const MODELS_PATH = path.join(environment.supportPath, "models");

const LLM_MODEL_CONFIG_STORAGE_KEY = "llm-model";

const llmModelRegistry: Store<LlmModel[]> & {
  // Emit errors
  error$: Subject<Error>;
  // Allow checking if model is locally downloaded or not
  modelDownloadedStatus: BehaviorSubject<Record<string, boolean>>;
} = {
  subject: new BehaviorSubject<LlmModel[]>([]),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {
    autoRefresh: new Subscription(),
  },
  error$: new Subject<Error>(),
  modelDownloadedStatus: new BehaviorSubject<Record<string, boolean>>({}),
  init: async () => {
    // Create model dir if not yet exists
    fs.mkdirSync(MODELS_PATH, { recursive: true });

    // Setup auto refresh
    llmModelRegistry.selfSubscription.autoRefresh = concat(
      // Trigger init
      of(-1),
      // Refresh every 30 seconds
      interval(30_000),
    ).subscribe(async () => {
      // Set status not ready
      llmModelRegistry.status.ready.next(false);

      // List directory, filter for json files
      const jsonFiles = fs
        .readdirSync(MODEL_CONFIGS_PATH)
        .map((f) => path.join(MODEL_CONFIGS_PATH, f))
        .filter((f) => fs.statSync(f).isFile() && f.endsWith(".json"));
      try {
        // Get models configs
        const llmModels = await Promise.all(
          jsonFiles.map(
            (f) =>
              new Promise<string>((resolve, reject) => {
                fs.readFile(f, { encoding: "utf8", flag: "r" }, (err, data) => {
                  if (err) reject(err);
                  else resolve(data);
                });
              }),
          ),
        ).then((modelsRaw) => modelsRaw.map((m) => JSON.parse(m) as LlmModel));

        // Get downloaded model files
        const downloadedModels = fs
          .readdirSync(MODELS_PATH)
          .filter((f) => fs.statSync(path.join(MODELS_PATH, f)).isFile())
          .map((f) => f.replace(/\.gguf$/i, ""));

        // Map models with downloaded status
        llmModelRegistry.modelDownloadedStatus.next(
          llmModels.reduce(
            (acc, model) => {
              acc[model.id] = downloadedModels.includes(model.id);
              return acc;
            },
            {} as Record<string, boolean>,
          ),
        );
        // Update model registry
        llmModelRegistry.subject.next(llmModels);
      } catch (e) {
        // On error, emit
        llmModelRegistry.error$.next(e as Error);
      } finally {
        // Set status ready
        llmModelRegistry.status.ready.next(true);
      }
    });
  },
  [Symbol.asyncDispose]: async () => {
    disposerFactory(llmModelRegistry)();
  },
};

const llmModelStore: Store<LlmModel> & {
  setConfig: (newConfig: Partial<LlmModel>) => Subject<{
    current: number;
    total?: number;
    percent: number;
  }>;
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
  setConfig: (
    newConfig: Partial<LlmModel>,
  ): Subject<{
    current: number;
    total?: number;
    percent: number;
  }> => {
    const mergedConfig = {
      ...llmModelStore.subject.getValue(),
      ...newConfig,
    };
    // Before downloading, set status ready to false
    llmModelStore.status.ready.next(false);
    // Progress report subject
    const progress$ = new Subject<{
      current: number;
      total?: number;
      percent: number;
    }>();
    // Try to download model if it's not already downloaded
    const _sub = download(
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

const useLlmModel = () => {
  const [llmModel, setLlmModel] = useState<LlmModel>();

  useEffect(() => {
    const sub = llmModelStore.subject.pipe(shareReplay(1)).subscribe(setLlmModel);
    llmModelStore.init();
    return () => {
      sub.unsubscribe();
      llmModelStore[Symbol.asyncDispose]();
    };
  }, []);

  return {
    llmModel,
  };
};

export { llmModelRegistry, llmModelStore, useLlmModel };
