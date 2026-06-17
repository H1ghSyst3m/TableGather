import type { I18nContextValue } from "./context";

export function translateCommonRoomServerError(message: string, t: I18nContextValue["t"]) {
  if (message === "Too many room requests.") return t("errors.roomTooManyRequests");
  return message;
}
