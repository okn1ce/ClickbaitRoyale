
import React from 'react';
import { ThumbnailData } from '../types';

interface ThumbnailRendererProps {
  data: ThumbnailData;
}

const ThumbnailRenderer: React.FC<ThumbnailRendererProps> = ({ data }) => {
  if (!data) return null;

  const { canvasState, bgColor, filterSaturation, filterContrast, filterBlur, imageUrl } = data;

  return (
    <div 
      className="w-full h-full relative overflow-hidden select-none"
      style={{
        backgroundColor: bgColor || '#000',
        containerType: 'inline-size', // Vital for cqw units
        filter: `saturate(${filterSaturation ?? 100}%) contrast(${filterContrast ?? 100}%) blur(${filterBlur || 0}px)`
      }}
    >
      {/* Background Image */}
      {imageUrl && (
        <img 
          src={imageUrl} 
          className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
          alt="bg"
        />
      )}

      {/* Canvas Elements */}
      {canvasState?.map(el => {
        // Calculate position as percentage of 800x450 canvas
        const left = (el.x / 800) * 100;
        const top = (el.y / 450) * 100;
        
        // Calculate size as percentage
        // Text relies on font-size, others rely on width/height
        const width = el.type === 'text' ? 'auto' : (el.width * el.scale / 800) * 100;
        const height = el.type === 'text' ? 'auto' : (el.height * el.scale / 450) * 100;

        // Calculate font size using Container Query Width (cqw)
        // 800px is the reference width.
        // If font is 60px, that is (60/800) = 7.5% of width.
        const fontSizeCQW = ((el.fontSize || 60) * el.scale / 800) * 100;

        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: width === 'auto' ? 'auto' : `${width}%`,
              height: height === 'auto' ? 'auto' : `${height}%`,
              transform: `rotate(${el.rotation}deg)`,
              zIndex: el.zIndex,
              color: el.color || '#fff',
            }}
            className="flex items-center justify-center pointer-events-none"
          >
            {el.type === 'text' ? (
              <span
                style={{
                  fontFamily: el.fontFamily || 'Anton',
                  fontSize: `${fontSizeCQW}cqw`, // Responsive font size
                  lineHeight: 1,
                  whiteSpace: 'nowrap'
                }}
                className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              >
                {el.content}
              </span>
            ) : el.type === 'image' ? (
              <img 
                src={el.content} 
                className="w-full h-full object-contain drop-shadow-xl"
                alt="asset"
              />
            ) : (
              // Shapes (SVG)
              <div 
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: el.content }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ThumbnailRenderer;
