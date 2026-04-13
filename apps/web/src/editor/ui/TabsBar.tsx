type Tab = {
  id: string;
  title: string;
  isActive: boolean;
};

type TabsBarProps = {
  tabs: Tab[];
};

export function TabsBar({ tabs }: TabsBarProps) {
  return (
    <div className="tabs-bar" role="tablist" aria-label="Open documents">
      {tabs.map((tab) => (
        <button
          aria-selected={tab.isActive}
          className="document-tab"
          key={tab.id}
          role="tab"
          type="button"
        >
          {tab.title}
        </button>
      ))}
    </div>
  );
}
