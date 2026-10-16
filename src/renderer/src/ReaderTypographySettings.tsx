import type { AppSettings } from '../../shared/contracts'
import { DEFAULT_READER_TYPOGRAPHY, READER_FONTS, readerFontFamily, readerTypographyStyle } from '../../shared/reader-typography'

type Props = {
  settings: AppSettings
  onPreview: (patch: Partial<AppSettings>) => void
  onSave: (patch: Partial<AppSettings>) => Promise<void>
}

function TypographyRange({ name, title, description, min, max, step, output, settings, onPreview, onSave }: Props & {
  name: 'readerFontSize' | 'readerLineHeight' | 'readerLetterSpacing'
  title: string; description: string; min: number; max: number; step: number; output: string
}): React.JSX.Element {
  const save = (value: string): void => { void onSave({ [name]: Number(value) }) }
  return <label className="setting-card" htmlFor={name}>
    <div className="setting-title">
      <div><strong>{title}</strong><span>{description}</span></div>
      <output htmlFor={name}>{output}</output>
    </div>
    <input id={name} aria-label={title} aria-valuetext={output} type="range" min={min} max={max} step={step}
      value={settings[name]} onChange={(event) => onPreview({ [name]: Number(event.currentTarget.value) })}
      onPointerUp={(event) => save(event.currentTarget.value)} onBlur={(event) => save(event.currentTarget.value)}
      onKeyUp={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
          save(event.currentTarget.value)
        }
      }} />
  </label>
}

export function ReaderTypographySettings(props: Props): React.JSX.Element {
  const { settings, onSave } = props
  return <>
    <label className="setting-card reader-font-settings" htmlFor="readerFontFamily">
      <div className="setting-title"><div><strong>阅读字体</strong><span>仅影响导入的 TXT，不改变网页字体</span></div></div>
      <select id="readerFontFamily" className="reader-font-select" aria-label="阅读字体" value={settings.readerFontFamily}
        onChange={(event) => { void onSave({ readerFontFamily: readerFontFamily(event.currentTarget.value) }) }}>
        {READER_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
      </select>
      <span>使用本机字体；楷体等未安装时自动回退。</span>
    </label>
    <TypographyRange {...props} name="readerFontSize" title="阅读字号" description="适用于 TXT 阅读器"
      min={12} max={34} step={1} output={`${settings.readerFontSize}px`} />
    <TypographyRange {...props} name="readerLineHeight" title="阅读行距" description="按字号比例调整行间留白"
      min={1.2} max={2.8} step={0.1} output={`${settings.readerLineHeight.toFixed(1)} 倍`} />
    <TypographyRange {...props} name="readerLetterSpacing" title="阅读字距" description="随字号缩放；0 表示不额外加宽"
      min={0} max={0.12} step={0.01} output={`${(settings.readerFontSize * settings.readerLetterSpacing).toFixed(1)}px`} />
    <section className="setting-card setting-wide reader-typography-settings" aria-label="阅读排版预览">
      <div className="setting-title"><div><strong>阅读排版预览</strong><span>推荐：黑体 · 20px · 2 倍行距 · 0.8px 字距</span></div>
        <button className="reader-preset-button" type="button" onClick={() => { void onSave({ ...DEFAULT_READER_TYPOGRAPHY }) }}>恢复推荐排版</button>
      </div>
      <div className={`reader-typography-preview theme-${settings.readerTheme}`} style={readerTypographyStyle(settings)}>
        窗外的风吹过树梢，阳光落在翻开的书页上。{'\n'}
        他停下脚步，读完这一行，又安静地读向下一行。{'\n'}
        一章故事，一段闲暇。Chapter 12 · 2026
      </div>
    </section>
  </>
}
