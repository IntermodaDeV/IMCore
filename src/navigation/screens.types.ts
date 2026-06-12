import { ComponentType } from 'react';

type ScreenComponent = ComponentType<any>;

interface ModuleRoute {
  Screen: ScreenComponent;
  Childs: Record<string, ScreenComponent>;
}

export type TScreens = Record<string, ModuleRoute>;


export type TScreenEntry = ScreenComponent | ModuleRoute;