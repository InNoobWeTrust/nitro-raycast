import { combineLatest, map, shareReplay, tap } from "rxjs";
import { chatConfigStore, chatHistoryStore, nitroManager } from "../store";
import { useEffect } from "react";

// Combined busy status
const busy$ = combineLatest([
  chatConfigStore.status.ready.pipe(shareReplay(1)),
  chatHistoryStore.status.ready.pipe(shareReplay(1)),
  nitroManager.status.ready.pipe(shareReplay(1)),
]).pipe(
  tap(([configReady, historyReady, nitroReady]) =>
    console.warn(`configReady: ${configReady}, historyReady: ${historyReady}, nitroReady: ${nitroReady}`),
  ),
  map(([configReady, historyReady, nitroReady]) => !(configReady && historyReady && nitroReady)),
  tap((busy) => console.warn(`busy: ${busy}`)),
);

const useNitro = () => {
  useEffect(() => {
    // Init storages
    Promise.resolve()
      .then(
        // Init config
        chatConfigStore.init,
      )
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

export { busy$, useNitro };
