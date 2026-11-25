import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { mountDashboard } from '../shared/dashboard'
import '../shared/document.css'
import { classes } from '../tailwind/classes'
import { Scope } from '../tailwind/Scope'
import './theme.css'

mountDashboard(
  { ...classes, action: 'size-[31px] rounded-[7px] hover:bg-brand-ink' },
  Scope,
  {
    Card,
    Button: (props) => <Button {...props} size="icon-sm" />,
    Badge,
  },
)
