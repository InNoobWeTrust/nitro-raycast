import { ActionPanel, Action, showToast, List, Icon, Toast } from "@raycast/api";
import { flattenProps, toSerializable, useSubscribableState } from "./utils";
import { MODELS_PATH, MODEL_CONFIGS_PATH, llmModelRegistry, llmModelStore } from "./store";
import { showFailureToast } from "@raycast/utils";
import { ModelSelectionApp } from "./context/model-selection";
import { LlmModel } from "./types";
import { combineLatest, debounceTime, map, shareReplay } from "rxjs";
import { useEffect } from "react";

export default function Command() {
  const ready = useSubscribableState<boolean>(
    combineLatest(
      llmModelStore.status.ready.pipe(shareReplay(1)),
      llmModelRegistry.status.ready.pipe(shareReplay(1)),
    ).pipe(map((readyStatuses) => readyStatuses.every(Boolean))),
    false,
  );
  const availableModels = useSubscribableState<LlmModel[]>(
    llmModelRegistry.subject,
    llmModelRegistry.subject.getValue(),
  );
  const modelDownloadedStatus = useSubscribableState<Record<string, boolean>>(
    llmModelRegistry.modelDownloadedStatus,
    llmModelRegistry.modelDownloadedStatus.getValue(),
  );
  const llmModel = useSubscribableState<LlmModel | undefined>(llmModelStore.subject, llmModelStore.subject.getValue());

  // Show error toast if failed to check registry
  useEffect(() => {
    const sub = llmModelRegistry.error$.subscribe((e) => showFailureToast(e));

    return () => {
      sub.unsubscribe();
    };
  }, []);

  return (
    <ModelSelectionApp>
      <List isShowingDetail isLoading={!ready}>
        {availableModels.map((model) => (
          <List.Item
            key={model.id}
            icon={modelDownloadedStatus[model.id] ? (llmModel?.id == model.id ? Icon.Bolt : Icon.Check) : Icon.Download}
            title={model.name}
            detail={
              <List.Item.Detail
                markdown={"```json\n" + JSON.stringify(model, null, 2) + "\n```"}
                metadata={
                  <List.Item.Detail.Metadata>
                    {Object.entries(flattenProps(toSerializable(model) as unknown as Record<string, unknown>)).map(
                      ([label, value]) =>
                        Array.isArray(value) ? (
                          <List.Item.Detail.Metadata.TagList key={label} title={label}>
                            {value.map((v) => (
                              <List.Item.Detail.Metadata.TagList.Item
                                key={JSON.stringify(v)}
                                text={JSON.stringify(v)}
                              />
                            ))}
                          </List.Item.Detail.Metadata.TagList>
                        ) : label.includes("url") ? (
                          <List.Item.Detail.Metadata.Link
                            key={label}
                            title={label}
                            text={value as string}
                            target={value as string}
                          />
                        ) : (
                          <List.Item.Detail.Metadata.Label key={label} title={label} text={JSON.stringify(value)} />
                        ),
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title={modelDownloadedStatus[model.id] ? "Use Model" : "Download and Use Model"}
                  icon={modelDownloadedStatus[model.id] ? Icon.Bolt : Icon.Download}
                  onAction={async () => {
                    if (!ready) {
                      showFailureToast(Error("Model registry or store not ready. Please try again later."));
                      return;
                    }
                    const toast = await showToast({
                      title: `Downloading model ${model.id}...`,
                      style: Toast.Style.Animated,
                    });
                    (await llmModelStore.use(model))
                      .pipe(
                        // Only show progress and total length
                        map(({ total, percent }) => ({ total, percent })),
                        // Reduce update frequency to 100ms
                        debounceTime(100),
                      )
                      .subscribe({
                        next: ({ total, percent }) => {
                          toast.title = `Downloaded ${Math.round(percent * 100)}% of ${total?.toLocaleString() || "??"} bytes`;
                        },
                        error: async (e) => {
                          await toast.hide();
                          showFailureToast(e);
                        },
                        complete: () => {
                          toast.title = `Model downloaded and config is used for launching with Nitro`;
                          toast.style = Toast.Style.Success;
                          // Dismiss after 250ms
                          setTimeout(toast.hide, 250);
                        },
                      });
                  }}
                />
                {modelDownloadedStatus[model.id] && (
                  <Action
                    title="Delete Model"
                    icon={Icon.Trash}
                    onAction={async () => {
                      if (!ready) {
                        showFailureToast({ title: "Model registry or store not ready. Please try again later." });
                        return;
                      }
                      await llmModelRegistry.remove(model.id);
                    }}
                  />
                )}
                <Action.Open title="Open Config Folder" target={MODEL_CONFIGS_PATH} />
                <Action.Open title="Open Model Folder" target={MODELS_PATH} />
              </ActionPanel>
            }
          />
        ))}
      </List>
    </ModelSelectionApp>
  );
}
