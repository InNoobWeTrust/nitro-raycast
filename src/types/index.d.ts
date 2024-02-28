import { BehaviorSubject } from "rxjs";

interface Store<T> extends AsyncDisposable {
  subject: BehaviorSubject<T>;
  status: Record<string, BehaviorSubject<boolean>>;
  selfSubscription: Record<string, Subscription>;
  init: () => Promise<void>;
}

interface NitroChatConfig {
  model: string;
  max_tokens: number;
  stop: string[];
  frequency_penalty: number;
  presence_penalty: number;
  temperature: number;
  top_p: number;
  context_length: number;
}

interface LlmModel {
  source_url: string;
  id: string;
  name: string;
  settings: {
    ctx_len: number;
    ngl: number;
    prompt_template: string;
  };
}

type Chat = {
  role: "system" | "assistant" | "user";
  content: string;
}[];

interface LlmUserInfo {
  name: string;
}
