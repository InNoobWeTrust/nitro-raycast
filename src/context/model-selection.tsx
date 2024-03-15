import { useDownloader } from "../hook/downloader";
import { useLlmModel, useLlmRegistry } from "../hook/llm-model";

const ModelSelectionApp = ({ children }: { children: JSX.Element }) => {
  // Initialize the stores
  useLlmRegistry();
  useLlmModel();
  useDownloader();

  return <>{children}</>;
};

export { ModelSelectionApp };
