import { ActionPanel, Action, Form, useNavigation, Detail, showToast, confirmAlert, List, Icon } from "@raycast/api";
import { flattenProps, toSerializable, useSubscribableState } from "./utils";
import { llmModelRegistry, llmModelStore } from "./store";
import { showFailureToast } from "@raycast/utils";
import { ModelSelectionApp } from "./context/model-selection";
import { LlmModel } from "./types";
import { combineLatest, map, shareReplay } from "rxjs";
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
  const llmModel = useSubscribableState<LlmModel>(llmModelStore.subject, llmModelStore.subject.getValue());

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
            icon={modelDownloadedStatus[model.id] ? Icon.Check : Icon.Download}
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
                              <List.Item.Detail.Metadata.TagList.Item key={v} text={v} />
                            ))}
                          </List.Item.Detail.Metadata.TagList>
                        ) : (
                          <List.Item.Detail.Metadata.Label key={label} title={label} text={JSON.stringify(value)} />
                        ),
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
          />
        ))}
      </List>
    </ModelSelectionApp>
  );
}
