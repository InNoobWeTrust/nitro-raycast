import http from "node:https";
import fs from "node:fs";
import { Observable, Subject, Subscription, debounceTime, take, tap } from "rxjs";
import { useEffect, useState } from "react";

const downloader = (url: string, dest: string, cancel$: Subject<void>) =>
  new Observable<number>((subscriber) => {
    // Set initial progress to 0
    subscriber.next(0);

    // If a file already exists, skip download
    if (fs.existsSync(dest)) {
      // Set progress to 1 to show progress bar
      subscriber.next(1);
      // Complete the observable
      subscriber.complete();
      return;
    }

    // Abortable downloader
    const controller = new AbortController();
    // File stream
    const fileStream = fs.createWriteStream(dest);

    // Abort on signal
    cancel$
      .pipe(
        take(1),
        tap(controller.abort),
        // Wait for 100ms before closing file stream
        debounceTime(100),
        tap(fileStream.close),
        // Wait for 200ms before deleting incomplete file
        debounceTime(200),
        tap(() => fs.unlink(dest, () => void 0)),
      )
      .subscribe();

    const request = http.get(url, { signal: controller.signal }, (response) => {
      const totalLength = Number(response.headers["content-length"]);
      response.on("data", (chunk) => {
        subscriber.next(chunk.length / totalLength);
      });
      response.on("end", () => {
        subscriber.complete();
      });
      // Pipe downloaded content to file stream
      response.pipe(fileStream);
    });
    request.on("error", (err) => {
      // On error, close file stream and delete incomplete file
      fileStream.close();
      fs.unlink(dest, () => void 0);
      subscriber.error(err);
    });
  });

const useDownloader = () => {
  const [progress, setProgress] = useState(0);
  const cancel$ = new Subject<void>();
  let sub: Subscription;
  const download = (url: string, dest: string) => {
    cancel$.next();
    sub = downloader(url, dest, cancel$).subscribe(setProgress);
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

export { downloader, useDownloader };
