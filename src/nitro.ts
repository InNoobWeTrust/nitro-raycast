import { LocalStorage } from "@raycast/api";
import { useEffect, useState } from "react";
import { initialize, runModel, killSubprocess, chatCompletion } from "@janhq/nitro-node";
import { BehaviorSubject } from "rxjs";

const CHAT_STORAGE_KEY = "chat-history";
const chatSubject = new BehaviorSubject<
  {
    role: "assistant" | "user";
    content: string;
  }[]
>([]);

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
  requestCompletion: async (msg: string, signalCompletion: () => void) => {
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
    const reply = await response.json();
    chatSubject.next([
      ...chatSubject.getValue(),
      {
        content: reply.choices[0].message?.content || "Error",
        role: "assistant",
      },
    ]);
    signalCompletion();
  },
  subject: chatSubject,
};

export const useNitro = () => {
  const [isLoading, setLoading] = useState(true);
  const [chats, setChats] = useState<string[]>([]);

  useEffect(() => {
    // IFFE function
    (async function() {
      await initialize();
      await runModel({
        modelPath: "/Users/innoobwetrust/jan/models/tinyllama-1.1b",
        promptTemplate: "<|system|>\n{system_message}<|user|>\n{prompt}<|assistant|>",
      });
      setLoading(false);
      chatStore.subject.subscribe({
        next: (msgs) => {
          setChats(msgs.map((m) => m.content));
        },
      });
    })();
    return () => {
      (async function() {
        await killSubprocess();
      })();
    };
  }, []);

  const addChat = (msg: string) => {
    setLoading(true);
    chatStore.requestCompletion(msg, () => setLoading(false));
  };

  return {
    isLoading,
    chats,
    addChat,
  };
};
