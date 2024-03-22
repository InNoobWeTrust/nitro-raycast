import { LocalStorage, environment } from "@raycast/api";
import { BehaviorSubject, Subject, Subscription, combineLatest, map, shareReplay } from "rxjs";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
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
    refresh: new BehaviorSubject(false),
    removal: new BehaviorSubject(false),
  },
  selfSubscription: {
    setReady: new Subscription(),
  },
  error$: new Subject<Error>(),
  modelDownloadedStatus: new BehaviorSubject<Record<string, boolean>>({}),
  init: async () => {
    // Create model root directory if not yet exist
    await fs.mkdir(MODELS_PATH, { recursive: true });
    // Tracking operations to set ready status
    llmModelRegistry.selfSubscription.setReady = combineLatest([
      llmModelRegistry.status.refresh,
      llmModelRegistry.status.removal,
    ])
      .pipe(map(([refresh, removal]) => !refresh && !removal))
      .subscribe((ready) => llmModelRegistry.status.ready.next(ready));
    // Trigger first refresh
    await llmModelRegistry.refresh();
    llmModelRegistry.status.ready.next(true);
  },
  refresh: async () => {
    // Set status
    llmModelRegistry.status.refresh.next(true);

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
      // Set status
      llmModelRegistry.status.refresh.next(false);
    }
  },
  remove: async (modelId: string) => {
    console.log(`Removing model ${modelId}...`);
    // Unset the active model if removing the currently chosen model
    if (llmModelStore.subject.getValue()?.id === modelId) {
      llmModelStore.subject.next(undefined);
    }

    // Throw error if model is not yet downloaded
    if (!llmModelRegistry.modelDownloadedStatus.getValue()[modelId]) {
      throw Error(`Model with id <${modelId}> is not yet downloaded`);
    }

    // Set status before update
    llmModelRegistry.status.removal.next(false);

    try {
      // Find the full file name of model
      const dirContent = await fs.readdir(MODELS_PATH, { recursive: true });
      console.log(dirContent);
      const modelDirName = dirContent.find(
        (f) => fsSync.statSync(path.join(MODELS_PATH, f)).isDirectory() && path.basename(f).startsWith(modelId),
      );
      // If not found, maybe a refresh not yet catch up
      if (!modelDirName) {
        throw Error(`[Fatal error]: model for id <${modelId}> not found!`);
      }
      // Remove model file
      await fs.rm(path.join(MODELS_PATH, modelDirName), { recursive: true, force: true });
    } finally {
      // After removal, force refresh registry
      await llmModelRegistry.refresh();
      // Set status
      llmModelRegistry.status.removal.next(true);
    }
  },
  [Symbol.asyncDispose]: async () => {
    await disposerFactory(llmModelRegistry)();
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
      // Clear if config is undefined
      if (!config) {
        LocalStorage.removeItem(LLM_MODEL_CONFIG_STORAGE_KEY);
        return;
      }
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
    // Create model-specific directory if not yet exist
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

export { llmModelRegistry, llmModelStore, MODEL_CONFIGS_PATH, MODELS_PATH };
