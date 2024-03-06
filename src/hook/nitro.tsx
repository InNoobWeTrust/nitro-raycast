import { chatHistoryStore, nitroManager } from "../store";
import { useEffect } from "react";

const useNitro = () => {
  useEffect(() => {
    // Init storages
    Promise.resolve()
      .then(
        // Init chat history
        chatHistoryStore.init,
      )
      .then(
        // Init nitro
        nitroManager.init,
      );

    return () => {
      nitroManager[Symbol.asyncDispose]();
    };
  }, []);
};

export { useNitro };
