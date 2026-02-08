type Props = {
  label: string
  onClick: () => void
}

export const OptionCard = ({ label, onClick }: Props) => (
  <button
    onClick={onClick}
    className="w-full p-4 bg-white rounded-xl shadow text-left"
  >
    {label}
  </button>
)
