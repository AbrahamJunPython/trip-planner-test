import { OptionCard } from './OptionCard'
import { Step, State } from '../types'
import { StepProgress } from './StepProgress'

type Props = {
  step: Step
  state: State
  onSelect: (value: string) => void
}

export const StepContainer = ({ step, state, onSelect }: Props) => {
  if (step === 'area') {
    return (
      <>
        <StepProgress current={1} total={3} />
        <h2 className="font-bold mb-4">エリアを選ぶ</h2>
        <div className="space-y-3">
          {['shibuya', 'shinjuku'].map((v) => (
            <OptionCard key={v} label={v} onClick={() => onSelect(v)} />
          ))}
        </div>
      </>
    )
  }

  if (step === 'genre') {
    return (
      <>
        <StepProgress current={2} total={3} />
        <h2 className="font-bold mb-4">ジャンルを選ぶ</h2>
        <div className="space-y-3">
          {['yakiniku', 'sushi'].map((v) => (
            <OptionCard key={v} label={v} onClick={() => onSelect(v)} />
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <StepProgress current={3} total={3} />
      <h2 className="font-bold mb-4">確認</h2>
      <p className="mb-6 text-sm text-gray-600">
        {state.area} / {state.genre}
      </p>
    </>
  )
}
