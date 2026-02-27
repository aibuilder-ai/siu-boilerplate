import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@{{projectName}}/ui/components/button";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{{projectName}}</h1>
      {user ? (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Signed in as {user.email}
          </p>
          <form action={signOut}>
            <Button variant="outline">Sign out</Button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground">Ready to build.</p>
          <Button asChild>
            <a href="/login">Sign in</a>
          </Button>
        </div>
      )}
    </div>
  );
}
