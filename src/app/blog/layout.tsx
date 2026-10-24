export default function Bloglayout(props: LayoutProps<"/blog">) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">博客的骨架</h1>
      <div className="ml-15">{ props.children }</div>
    </div>
  );
}
