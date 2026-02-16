from PIL import Image, ImageDraw

def create_shield_icon(size):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale factor
    s = size / 128
    
    # Shield shape (simplified)
    shield_points = [
        (64*s, 10*s),
        (20*s, 30*s),
        (20*s, 70*s),
        (64*s, 118*s),
        (108*s, 70*s),
        (108*s, 30*s)
    ]
    
    # Draw shield
    draw.polygon(shield_points, fill=(102, 126, 234), outline=(86, 107, 198))
    
    # Draw checkmark
    check_points = [
        (45*s, 64*s),
        (56*s, 75*s),
        (85*s, 46*s)
    ]
    draw.line(check_points, fill=(255, 255, 255), width=int(8*s), joint='curve')
    
    return img

# Create icons
for size in [16, 48, 128]:
    icon = create_shield_icon(size)
    icon.save(f'icon{size}.png')

print("Icons created successfully!")
