import { busy$, useNitro } from "../hook/nitro";
import { useUserInfo } from "../hook/user-info";
import { useDownloader } from "../hook/downloader";

const App = ({ children }: { children: JSX.Element }) => {
  // Initialize the stores
  useNitro();
  useUserInfo();
  useDownloader();

  return <>{children}</>;
};

export { App, busy$ };
