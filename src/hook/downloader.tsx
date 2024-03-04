import { useEffect, useState } from "react";
import { Subject, Subscription } from "rxjs";
import { download as _download } from "../action";

const useDownloader = () => {
  const [progress, setProgress] = useState<{
    current: number;
    total?: number;
    percent: number;
  }>({
    current: 0,
    percent: 0,
  });
  const cancel$ = new Subject<void>();
  let sub: Subscription;
  const download = (url: string, dest: string) => {
    cancel$.next();
    sub = _download(url, dest, cancel$).subscribe(setProgress);
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
