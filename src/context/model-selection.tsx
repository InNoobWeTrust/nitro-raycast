import { useDownloader } from "../hook/downloader";
import { useLlmRegistry } from "../hook/llm-model";
import { useLlmModel } from "../store";

const ModelSelectionApp = ({ children }: { children: JSX.Element }) => {
  // Initialize the stores
  useLlmRegistry();
  useLlmModel();
  useDownloader();

  return <>{children}</>;
};

export { ModelSelectionApp };
