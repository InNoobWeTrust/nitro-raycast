import { LocalStorage, environment } from "@raycast/api";
import { BehaviorSubject, Subject, Subscription, concat, interval, of, shareReplay } from "rxjs";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { useEffect, useState } from "react";
import { LlmModel, Store } from "../types";
import { disposerFactory } from "../utils";
import { download } from "../action";

const MODEL_CONFIGS_PATH = path.join(environment.assetsPath, "models");
const MODELS_PATH = path.join(environment.supportPath, "models");

const LLM_MODEL_CONFIG_STORAGE_KEY = "llm-model";

const llmModelRegistry: Store<LlmModel[]> & {
  refresh: () => Promise<void>;
  // Emit errors
  error$: Subject<Error>;
  // Allow checking if model is locally downloaded or not
  modelDownloadedStatus: BehaviorSubject<Record<string, boolean>>;
  remove: (modelId: string) => Promise<void>;
} = {
  subject: new BehaviorSubject<LlmModel[]>([]),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {},
  error$: new Subject<Error>(),
  modelDownloadedStatus: new BehaviorSubject<Record<string, boolean>>({}),
  init: async () => {
    // Trigger first refresh
    await llmModelRegistry.refresh();
  },
  refresh: async () => {
    // Set status not ready
    llmModelRegistry.status.ready.next(false);

    // List directory, filter for json files
    const jsonFiles = (await fs.readdir(MODEL_CONFIGS_PATH))
      .map((f) => path.join(MODEL_CONFIGS_PATH, f))
      .filter((f) => fsSync.statSync(f).isFile() && f.endsWith(".json"));
    try {
      // Get models configs
      const llmModels = await Promise.all(jsonFiles.map((f) => fs.readFile(f, { encoding: "utf-8", flag: "r" }))).then(
        (modelsRaw) => modelsRaw.map((m) => JSON.parse(m) as LlmModel),
      );

      // Get downloaded model files
      const downloadedModels = (await fs.readdir(MODELS_PATH, { recursive: true }))
        .filter((f) => fsSync.statSync(path.join(MODELS_PATH, f)).isFile())
        .map((f) => path.join(MODELS_PATH, f));

      // Map models with downloaded status
      llmModelRegistry.modelDownloadedStatus.next(
        llmModels.reduce(
          (acc, model) => {
            acc[model.id] = downloadedModels.map((f) => path.basename(f)).includes(model.settings.llama_model_path);
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
  },
  remove: async (modelId: string) => {
    // Throw error if model is not yet downloaded
    if (!llmModelRegistry.modelDownloadedStatus.getValue()[modelId]) {
      throw Error(`Model with id <${modelId}> is not yet downloaded`);
    }

    // Set status not ready before update
    llmModelRegistry.status.ready.next(false);
    try {
      // Find the full file name of model
      const fileName = (await fs.readdir(MODELS_PATH, { recursive: true })).find(
        (f) => fsSync.statSync(path.join(MODELS_PATH, f)).isFile() && path.basename(f).startsWith(modelId),
      );
      // If not found, maybe a refresh not yet catch up
      if (!fileName) {
        throw Error(`[Fatal error]: model file for id <${modelId}> not found!`);
      }
      // Remove model file
      await fs.unlink(path.join(MODELS_PATH, fileName));
      // After removal, force refresh registry
      await llmModelRegistry.refresh();
    } finally {
      // Set status ready
      llmModelRegistry.status.ready.next(true);
    }
  },
  [Symbol.asyncDispose]: async () => {
    // Nothing to cleanup
  },
};

const llmModelStore: Store<LlmModel | undefined> & {
  cancelDownload$: Subject<void>;
  use: (model: LlmModel) => Promise<
    Subject<{
      current: number;
      total?: number;
      percent: number;
    }>
  >;
} = {
  subject: new BehaviorSubject<LlmModel | undefined>(undefined),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {
    autoSave: new Subscription(),
  },
  cancelDownload$: new Subject<void>(),
  init: async () => {
    // Load config
    const configRaw = await LocalStorage.getItem<string>(LLM_MODEL_CONFIG_STORAGE_KEY);
    if (configRaw) llmModelStore.subject.next(JSON.parse(configRaw));
    // Subscribe to changes in runtime config and save to local storage
    llmModelStore.selfSubscription.autoSave = llmModelStore.subject.subscribe((config) => {
      // Skip unless config is defined
      if (!config) return;
      LocalStorage.setItem(LLM_MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config));
    });
    // Set status ready
    llmModelStore.status.ready.next(true);
  },
  [Symbol.asyncDispose]: async () => {
    await disposerFactory(llmModelStore)();
  },
  use: async (model: LlmModel) => {
    // Before downloading, set status ready to false
    llmModelStore.status.ready.next(false);
    // Progress report subject
    const progress$ = new Subject<{
      current: number;
      total?: number;
      percent: number;
    }>();
    // Cancel current download if any
    llmModelStore.cancelDownload$.next();
    // Create model-specific directory
    await fs.mkdir(path.join(MODELS_PATH, model.id), { recursive: true });
    // Try to download model if it's not already downloaded
    const _sub = download(
      model.sources[0].url,
      path.join(MODELS_PATH, model.id, model.settings.llama_model_path),
      llmModelStore.cancelDownload$,
    ).subscribe({
      next: (progress) => progress$.next(progress),
      complete: () => {
        llmModelStore.subject.next(model);
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

export { llmModelRegistry, llmModelStore, useLlmModel, MODEL_CONFIGS_PATH, MODELS_PATH };
