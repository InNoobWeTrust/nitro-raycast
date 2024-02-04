import { LocalStorage, environment } from "@raycast/api";
import { useEffect } from "react";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { BehaviorSubject } from "rxjs";

import { initialize, setBinPath, runModel, killSubprocess, chatCompletion } from "@janhq/nitro-node";

const CHAT_STORAGE_KEY = "chat-history";
const BIN_PATH = path.join(environment.supportPath, "bin");
const chatSubject = new BehaviorSubject<
  {
    role: "assistant" | "user";
    content: string;
  }[]
>([]);
const busyStatusSubject = new BehaviorSubject<boolean>(false);

export const chatStore = {
  init: async () => {
    const storedChatJson = await LocalStorage.getItem<string>(CHAT_STORAGE_KEY);
    const initialChat = storedChatJson
      ? JSON.parse(storedChatJson)
      : [
          {
            content:
              "You are a good productivity assistant. You help user with what they are asking in Markdown format . For responses that contain code, you must use ``` with the appropriate coding language to help display the code to user correctly.",
            role: "assistant",
          },
        ];
    chatSubject.next(initialChat);
    chatSubject.subscribe({
      next: (chats) => {
        LocalStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
      },
    });
  },
  requestCompletion: async (msg: string) => {
    busyStatusSubject.next(true);
    chatSubject.next([
      ...chatSubject.getValue(),
      {
        content: msg,
        role: "user",
      },
    ]);
    const response = await chatCompletion({
      messages: chatSubject.getValue(),
      model: "gpt-3.5-turbo",
      max_tokens: 2048,
      stop: [],
      frequency_penalty: 0,
      presence_penalty: 0,
      temperature: 0.7,
      top_p: 0.95,
      context_length: 4096,
    });
    const reply = (await response.json()) as { choices: { message: { content: string } }[] };
    console.log(JSON.stringify(reply.choices[0]?.message?.content));
    chatSubject.next([
      ...chatSubject.getValue(),
      {
        content: reply.choices[0]?.message?.content || "Error",
        role: "assistant",
      },
    ]);
    busyStatusSubject.next(false);
  },
  subject: chatSubject,
  busyStatus: busyStatusSubject,
};

export const useNitro = () => {
  useEffect(() => {
    // IFFE function
    (async function () {
      await fs.mkdir(BIN_PATH, { recursive: true });
      await initialize();
      await setBinPath(path.join(environment.supportPath, "bin"));
      await runModel({
        modelPath: path.join(os.homedir(), "jan", "models", "tinyllama-1.1b"),
        promptTemplate: "<|system|>\n{system_message}<|user|>\n{prompt}<|assistant|>",
      });
      chatStore.busyStatus.next(false);
    })();
    return () => {
      (async function () {
        await killSubprocess();
      })();
    };
  }, []);
};
