import { useMutation } from "@tanstack/react-query";
import { memberQueryKeys } from "./keys";

export function useMemberCreate() {
  useMutation({
    mutationKey: [memberQueryKeys.all],
    mutationFn: async () => {},
  });
}
