import { useEffect } from "react";
import { userInfoStore } from "../store";

const useUserInfo = () => {
  useEffect(() => {
    userInfoStore.init();
    return () => {
      userInfoStore[Symbol.asyncDispose]();
    };
  }, []);
};

export { useUserInfo };
