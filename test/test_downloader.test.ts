import { describe, test } from "@jest/globals";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { download } from "../src/action/download";

import * as modelCfg from "../assets/models/tinyllama-1.1b.json";
import { Subject } from "rxjs";

// Cleanup tmp directory that is used during tests
const cleanupTargetDirHook = (targetDir: string) => () => {
  fs.rmSync(targetDir, {
    recursive: true, // Remove whole directory
    maxRetries: 3, // Retry 3 times on error
    retryDelay: 250, // Back-off with 250ms delay
  });
};

/**
 * Test downloader functionality
 */
describe("Can download GGUF model from HuggingFace", () => {
  /// BEGIN SUITE CONFIG
  const modelDir = fs.mkdtempSync(path.join(os.tmpdir(), "nitro-raycast-downloader-test"));

  // Setup steps before running the suite
  const setupHooks: (() => PromiseLike<void> | void)[] = [];
  // Teardown steps after running the suite
  const teardownHooks: (() => PromiseLike<void> | void)[] = [
    // On teardown, cleanup tmp directory that was created earlier
    cleanupTargetDirHook(modelDir),
  ];
  /// END SUITE CONFIG

  /// BEGIN HOOKS REGISTERING
  beforeAll(
    // Run all the hooks sequentially
    async () => setupHooks.reduce((p, fn) => p.then(fn), Promise.resolve()),
    // Set timeout for tests to wait for downloading model before run
    10 * 60 * 1000,
  );
  afterAll(
    // Run all the hooks sequentially
    async () => teardownHooks.reduce((p, fn) => p.then(fn), Promise.resolve()),
    // Set timeout for cleaning up
    10 * 60 * 1000,
  );
  /// END HOOKS REGISTERING

  /// BEGIN TESTS
  test(
    "Download small gguf model",
    async () => {
      const cancel$ = new Subject<void>();
      await new Promise<void>((resolve, reject) => {
        download(
          modelCfg.sources[0].url,
          path.join(modelDir, modelCfg.id, modelCfg.settings.llama_model_path),
          cancel$,
        ).subscribe({
          next: ({ current, total, percent }) => {
            process.stdout.write(`\r\x1b[K[${modelCfg.name}] ${current}/${total} ${Math.floor(percent * 100)}%...`);
          },
          complete: () => {
            expect(fs.readdirSync(modelDir)).toHaveLength(1);
            resolve();
          },
          error: reject,
        });
      });
    },
    // Set timeout to 1 minutes
    1 * 60 * 1000,
  );
  /// END TESTS
});
