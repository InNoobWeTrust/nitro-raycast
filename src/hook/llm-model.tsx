import { llmModelRegistry, llmModelStore } from "../store";
import { useEffect } from "react";

const useLlmRegistry = () => {
  useEffect(() => {
    llmModelRegistry.init();

    return () => {
      llmModelRegistry[Symbol.asyncDispose]();
    };
  }, []);
};

const useLlmModel = () => {
  useEffect(() => {
    llmModelStore.init();

    return () => {
      llmModelStore[Symbol.asyncDispose]();
    };
  }, []);
};

export { useLlmModel, useLlmRegistry };
