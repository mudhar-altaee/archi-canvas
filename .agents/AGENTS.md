# Workspace Customization Rules

- Before applying any material, first analyze the scene as a 3D architectural environment, not as a flat 2D image.
- Detect every individual architectural element (walls, columns, beams, ceilings, floors, doors, windows, furniture) as separate objects.
- Identify all visible faces of each object, including front, side, top, and curved surfaces.
- Recognize edges, corners, thickness, curvature, and perspective.
- Treat curved walls and curved columns as continuous surfaces.
- Treat rectangular columns as four connected faces.
- Maintain consistent material across every visible face of the same object, even when perspective changes.
- Do not paint only a single visible region.
- Respect geometry, occlusion, depth, lighting, shadows, reflections, and existing architectural boundaries.
