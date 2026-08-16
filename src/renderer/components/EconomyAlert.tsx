import { ps, fonts, button, buttonPrimary } from '../theme'
import { Icon } from '../icons'

interface EconomyAlertProps {
  budget: number
  spent: number
  onContinue: () => void
  onReset: () => void
}

export default function EconomyAlert({ budget, spent, onContinue, onReset }: EconomyAlertProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 450,
      }}
    >
      <div
        style={{
          width: '440px',
          background: ps.panel,
          border: `1px solid ${ps.borderLight}`,
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          fontFamily: fonts.ui,
        }}
      >
        <div
          style={{
            height: '26px',
            background: ps.panelHeader,
            borderBottom: `1px solid ${ps.borderDark}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: '11px',
            color: ps.textStrong,
          }}
        >
          Достигнут лимит расходов
        </div>

        <div style={{ padding: '14px', display: 'flex', gap: '12px' }}>
          <span style={{ color: ps.warn, marginTop: '2px' }}>
            <Icon name="alert" size={26} strokeWidth={1} />
          </span>
          <div style={{ fontSize: '11px', lineHeight: 1.65, color: ps.text }}>
            Израсходовано{' '}
            <span style={{ color: ps.textStrong }}>${spent.toFixed(4)}</span> из{' '}
            <span style={{ color: ps.textStrong }}>${budget.toFixed(2)}</span>.
            <br />
            Включён эконом-режим: запросы идут на самую дешёвую модель, выбор моделей
            заблокирован.
            <br />
            <span style={{ color: ps.textFaint }}>
              «Сбросить счётчик» обнуляет накопленный расход и выключает эконом-режим.
              Лимит меняется в панели «Настройки».
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '6px',
            justifyContent: 'flex-end',
            padding: '0 14px 14px',
          }}
        >
          <button onClick={onReset} style={button}>
            <Icon name="refresh" size={12} />
            Сбросить счётчик
          </button>
          <button onClick={onContinue} style={buttonPrimary}>
            Продолжить
          </button>
        </div>
      </div>
    </div>
  )
}
