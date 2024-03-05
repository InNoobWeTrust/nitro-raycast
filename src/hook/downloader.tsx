import { useEffect, useState } from "react";
import { Subject, Subscription, debounceTime, map } from "rxjs";
import { download as _download } from "../action";

const useDownloader = () => {
  const [progress, setProgress] = useState<number>(0);
  const cancel$ = new Subject<void>();
  let sub: Subscription;
  const download = (url: string, dest: string) => {
    cancel$.next();
    sub = _download(url, dest, cancel$)
      .pipe(
        // Only interested in showing percentage in UI
        map(({ percent }) => percent),
        // Reduce UI update rate to each 250ms
        debounceTime(250),
      )
      .subscribe(setProgress);
  };

  useEffect(() => {
    return () => {
      cancel$.next();
      sub?.unsubscribe();
    };
  }, []);

  return {
    download,
    progress,
    cancel$,
  };
};

export { useDownloader };
