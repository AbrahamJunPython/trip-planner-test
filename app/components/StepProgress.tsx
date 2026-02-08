export const StepProgress = ({
  current,
  total,
}: {
  current: number
  total: number
}) => (
  <div className="text-sm text-gray-500 mb-4">
    {current} / {total}
  </div>
)