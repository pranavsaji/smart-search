import { redirect } from 'next/navigation'

// /settings has no hub page yet — style preferences is the only section.
export default function SettingsIndex() {
  redirect('/settings/style')
}
