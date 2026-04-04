function Bar({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} bg-dark-600 rounded-lg animate-pulse`} />;
}

export default function ViewSkeleton() {
  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      {/* Hero card */}
      <div className="bg-dark-700 rounded-2xl border border-dark-500 p-5 space-y-3">
        <Bar h="h-3" w="w-24" />
        <Bar h="h-10" w="w-40" />
        <Bar h="h-2" w="w-48" />
        <Bar h="h-2" />
      </div>

      {/* 3-col stat row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-dark-700 rounded-xl border border-dark-500 p-4 space-y-2">
            <Bar h="h-3" w="w-8" />
            <Bar h="h-6" w="w-12" />
            <Bar h="h-2" w="w-16" />
          </div>
        ))}
      </div>

      {/* Content card */}
      <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 space-y-3">
        <Bar h="h-3" w="w-32" />
        <Bar h="h-16" />
        <Bar h="h-12" />
      </div>

      {/* List rows */}
      <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 space-y-3">
        <Bar h="h-3" w="w-24" />
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-dark-600 rounded-xl animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bar h="h-3" w="w-3/4" />
              <Bar h="h-2" w="w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
