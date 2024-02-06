import { describe, test } from "@jest/globals";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Duplex } from "node:stream";
import { WritableStream } from "node:stream/web";
import download from "download";
import { initialize, loadLLMModel, runModel, validateModelStatus, stopModel, chatCompletion } from "@janhq/nitro-node";

import * as modelCfg from "./test_assets/model.json";

// Test assets dir
const TEST_ASSETS_PATH = path.join(__dirname, "test_assets");

// Report download progress
const createProgressReporter = (name: string) => (stream: Promise<Buffer> & Duplex) =>
  stream
    .on("downloadProgress", (progress: { transferred: number; total: number; percent: number }) => {
      // Print and update progress on a single line of terminal
      process.stdout.write(
        `\r\x1b[K[${name}] ${progress.transferred}/${progress.total} ${Math.floor(progress.percent * 100)}%...`,
      );
    })
    .on("end", () => {
      // Jump to new line to log next message
      process.stdout.write(`${os.EOL}[${name}] Finished downloading!`);
    });

// Download model file
const downloadModelHook = (targetDir: string) => async () => {
  const fileName = modelCfg.source_url.split("/")?.pop() ?? "model.gguf";
  // Check if there is a downloaded model at TEST_ASSETS_PATH
  const downloadedModelFile = fs.readdirSync(TEST_ASSETS_PATH).find((fname) => fname.match(/.*\.gguf/gi));
  if (downloadedModelFile) {
    const downloadedModelPath = path.join(TEST_ASSETS_PATH, downloadedModelFile);
    // Copy model files to targetDir and return
    fs.cpSync(downloadedModelPath, path.join(targetDir, fileName));
    console.log(`Reuse cached model ${modelCfg.name} from path ${downloadedModelPath} => ${targetDir}`);
    return;
  }
  const progressReporter = createProgressReporter(modelCfg.name);
  await progressReporter(
    download(modelCfg.source_url, targetDir, {
      filename: fileName,
      strip: 1,
      extract: true,
    }),
  );
  console.log(`Downloaded model ${modelCfg.name} at path ${path.join(targetDir, fileName)}`);
};

// Cleanup tmp directory that is used during tests
const cleanupTargetDirHook = (targetDir: string) => () => {
  fs.rmSync(targetDir, {
    recursive: true, // Remove whole directory
    maxRetries: 3, // Retry 3 times on error
    retryDelay: 250, // Back-off with 250ms delay
  });
};

/**
 * Sleep for the specified milliseconds
 * @param {number} ms milliseconds to sleep for
 * @returns {Promise<NodeJS.Timeout>}
 */
const sleep = async (ms: number): Promise<NodeJS.Timeout> => Promise.resolve().then(() => setTimeout(() => void 0, ms));

/**
 * Basic test suite
 */
describe("Manage nitro process", () => {
  /// BEGIN SUITE CONFIG
  const modelPath = fs.mkdtempSync(path.join(os.tmpdir(), "nitro-node-test"));

  // Setup steps before running the suite
  const setupHooks = [
    // Download model before starting tests
    downloadModelHook(modelPath),
  ];
  // Teardown steps after running the suite
  const teardownHooks = [
    // Stop nitro after running, regardless of error or not
    () => stopModel(),
    // On teardown, cleanup tmp directory that was created earlier
    cleanupTargetDirHook(modelPath),
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
    "chat completion",
    async () => {
      // Initialize nitro
      await initialize();
      // Start nitro
      await runModel({
        modelPath,
        promptTemplate: modelCfg.settings.prompt_template,
        ctx_len: modelCfg.settings.ctx_len,
        ngl: modelCfg.settings.ngl,
        cont_batching: false,
        embedding: false,
        cpu_threads: -1, // Default to auto
      });
      // Wait 5s for nitro to start
      await sleep(5 * 1000);
      // Validate model status
      await validateModelStatus();
      let reply = "";
      // Run chat completion with stream
      const response = await chatCompletion(
        {
          messages: [
            {
              content:
                "You are a good productivity assistant. You help user with what they are asking in Markdown format . For responses that contain code, you must use ``` with the appropriate coding language to help display the code to user correctly.",
              role: "assistant",
            },
            { content: "Please give me a hello world code in cpp", role: "user" },
          ],
          model: "gpt-3.5-turbo",
          max_tokens: 2048,
          stop: [],
          frequency_penalty: 0,
          presence_penalty: 0,
          temperature: 0.7,
          top_p: 0.95,
          context_length: 4096,
        },
        new WritableStream({
          write(chunk: string) {
            const data = chunk.replace(/^\s*data:\s*/, "").trim();
            if (data.match(/\[DONE\]/)) {
              return;
            }
            const json = JSON.parse(data);
            reply += json.choices[0].delta.content ?? "";
          },
        }),
      );
      console.log(reply);
      // The response body is unusable if consumed by out stream
      await expect(response.text).rejects.toThrow();
      await expect(response.json).rejects.toThrow();
      // Response body should be used already
      expect(response.bodyUsed).toBeTruthy();
      // Stop nitro
      await stopModel();
    },
    // Set timeout to 1 minutes
    1 * 60 * 1000,
  );
  /// END TESTS
});
