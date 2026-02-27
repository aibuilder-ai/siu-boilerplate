import { Button } from "@{{projectName}}/ui/components/button";

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{{projectName}}</h1>
      <p className="text-muted-foreground">Ready to build.</p>
      <Button>Hello</Button>
    </div>
  );
}
