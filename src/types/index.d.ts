import { BehaviorSubject } from "rxjs";

interface Store<T> extends AsyncDisposable {
  subject: BehaviorSubject<T>;
  status: Record<string, BehaviorSubject<boolean>>;
  selfSubscription: Record<string, Subscription>;
  init: () => Promise<void>;
}

interface LlmModel {
  sources: {
    filename: string;
    url: string;
  }[];
  id: string;
  object: string;
  name: string;
  version: string;
  description: string;
  format: string;
  settings: {
    ctx_len: number;
    ngl: number;
    prompt_template: string;
    llama_model_path: string;
  };
  parameters: {
    temperature: number;
    top_p: number;
    stream: boolean;
    max_tokens: number;
    stop: string[];
    frequency_penalty: number;
    presence_penalty: number;
  };
  metadata: {
    author: string;
    tags: string[];
    size: number;
  };
  engine: "nitro" | string;
}

type Chat = {
  role: "system" | "assistant" | "user";
  content: string;
}[];

interface LlmUserInfo {
  name: string;
}
