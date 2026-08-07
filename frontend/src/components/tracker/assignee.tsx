import { UnassignedAvatar, UserAvatar } from "./chips";
import { useTracker } from "@/lib/tracker/store";

export function Assignee({ id, className }: { id: string | null; className?: string | undefined }) {
  const { users } = useTracker();
  const user = users.find((u) => u.id === id);
  if (!user) return <UnassignedAvatar className={className} />;
  return <UserAvatar name={user.name} initials={user.initials} avatarUrl={user.avatarUrl} className={className} />;
}

export function useUserName(id: string | null) {
  const { users } = useTracker();
  return users.find((u) => u.id === id)?.name ?? "Unassigned";
}
