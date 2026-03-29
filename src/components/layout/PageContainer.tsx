import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  size?: 'default' | 'narrow'
}

export function PageContainer({ children, className, size = 'default' }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto px-[10%] sm:px-[5%] lg:px-8',
        size === 'default' ? 'max-w-7xl' : 'max-w-4xl',
        className
      )}
    >
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  backHref?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({ title, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between py-4 border-b border-border', className)}>
      <h1 className="text-xl font-semibold font-display">{title}</h1>
      {children}
    </div>
  )
}
