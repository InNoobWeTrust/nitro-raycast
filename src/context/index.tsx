import { busy$, useNitro } from "./nitro";
import { useUserInfo } from "./user-info";
import { useDownloader } from "./downloader";

const App = ({ children }: { children: JSX.Element }) => {
  // Initialize the stores
  useNitro();
  useUserInfo();
  useDownloader();

  return <>{children}</>;
};

export { App, busy$ };
