import React from 'react';

interface GoppoKahiniLogoProps {
  customLogoUrl?: string;
  compact?: boolean;
  href?: string;
  onClick?: () => void;
}

export const GoppoKahiniLogo: React.FC<GoppoKahiniLogoProps> = ({
  customLogoUrl,
  compact = false,
  href = '/',
  onClick,
}) => {

  const content = (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
        <img
          src={customLogoUrl || '/assets/aistudio/Glossy_Red_Infinity_Ribbon_Logo_2028e914.png'}
          alt="Goppo Kahini"
          className="h-9 w-auto object-contain"
        />
      <span className="font-display-brand text-lg sm:text-2xl font-bold tracking-wide text-[#F6F1E7] hidden md:inline">
        {compact ? 'Goppo Kahini' : 'Goppo Kahini'}
      </span>
    </span>
  );

  if (onClick) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#EF4444] rounded-md cursor-pointer"
        aria-label="Goppo Kahini Home"
      >
        {content}
      </a>
    );
  }

  return content;
};
