import { useNitro } from "../hook/nitro";
import { useUserInfo } from "../hook/user-info";
import { useLlmModel, useLlmRegistry } from "../hook/llm-model";

const App = ({ children }: { children: JSX.Element }) => {
  // Initialize the stores
  useLlmRegistry();
  useLlmModel();
  useNitro();
  useUserInfo();

  return <>{children}</>;
};

export { App };
