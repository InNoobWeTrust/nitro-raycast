import { IncomingMessage } from "node:http";
import https from "node:https";
import fs from "node:fs";
import { Observable, Subject, Subscription, debounceTime, first, tap } from "rxjs";
import { useEffect, useState } from "react";

/**
 * Observable HTTPS request that follow redirects
 */
const request = (url: string, cancel$: Subject<void>): Observable<IncomingMessage> =>
  new Observable<IncomingMessage>((subscriber) => {
    // Abortable request
    const controller = new AbortController();
    // Abort on signal
    cancel$
      .pipe(
        first(),
        tap(() => controller.abort()),
      )
      .subscribe();

    https
      .get(url, { signal: controller.signal }, (response) => {
        if (response.statusCode === 302) {
          // Follow redirect
          https
            .get(response.headers.location!, { signal: controller.signal }, (res) => {
              subscriber.next(res);
              subscriber.complete();
            })
            .on("error", (e) => subscriber.error(e))
            .end();
          return;
        }
        if (response.statusCode !== 200) {
          subscriber.error(new Error(`${response.statusCode} - ${response.statusMessage}`));
          return;
        }
        subscriber.next(response);
        subscriber.complete();
      })
      .on("error", (e) => subscriber.error(e))
      .end();
  });

const downloader = (url: string, dest: string, cancel$: Subject<void>) =>
  new Observable<{
    current: number;
    total?: number;
    percent: number;
  }>((subscriber) => {
    // Set initial progress to 0
    subscriber.next({
      current: 0,
      percent: 0,
    });

    // If a file already exists, skip download
    if (fs.existsSync(dest)) {
      // Set progress to 1 to show progress bar
      subscriber.next({
        current: 0,
        total: 1,
        percent: 1,
      });
      // Complete the observable
      subscriber.complete();
      return;
    }

    // File stream
    const fileStream = fs.createWriteStream(dest);
    // Cleanup on cancel
    cancel$
      .pipe(
        first(),
        // Wait for 100ms before closing file stream
        debounceTime(100),
        tap(() => fileStream.close()),
        // Wait for 200ms before deleting incomplete file
        debounceTime(200),
        tap(() => fs.unlink(dest, () => void 0)),
      )
      .subscribe();

    request(url, cancel$).subscribe({
      next: (response) => {
        const totalLength = parseInt(response.headers["content-length"]!, 10);
        let downloaded = 0;
        response.on("data", (chunk) => {
          downloaded += chunk.length;
          subscriber.next({
            current: downloaded,
            total: totalLength,
            percent: downloaded / totalLength,
          });
        });
        response.on("close", () => {
          fileStream.close();
          subscriber.complete();
        });
        // Pipe downloaded content to file stream
        response.pipe(fileStream);
      },
      error: (e) => {
        // On error, close file stream and delete incomplete file
        fileStream.close();
        fs.unlink(dest, () => void 0);
        subscriber.error(e);
      },
    });
  });

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
