import { rpcClient } from "@/lib/rpc-client";

export default async function Home() {
  const res = await rpcClient.api.members.$get({
    query: { limit: "10", skip: "0" },
  });

  if (!res.ok) {
    const error = await res.json();
    console.error(error);
    return <div>Failed to load members</div>;
  }

  const members = await res.json();
  return (
    <>
      {members?.map((member) => (
        <span key={member.id}>{member.title}</span>
      ))}
    </>
  );
}
