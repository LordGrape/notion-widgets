// Adapted from shadcn/ui (MIT), with the widget's own CSS and tokens.
import React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { X, Check } from "lucide-react";
const buttonVariants = cva("ui-button", {
	variants: {
		variant: {
			default: "ui-primary",
			ghost: "ui-ghost",
			outline: "ui-outline",
		},
	},
	defaultVariants: { variant: "outline" },
});
export const Button = React.forwardRef(function Button(
	{ className, variant, asChild = false, ...props },
	ref,
) {
	const Component = asChild ? Slot : "button";
	return (
		<Component
			ref={ref}
			type={asChild ? undefined : "button"}
			className={clsx(buttonVariants({ variant }), className)}
			{...props}
		/>
	);
});
export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef((props, ref) => (
	<TabsPrimitive.List ref={ref} className="tabs ui-tabs" {...props} />
));
export const TabsTrigger = React.forwardRef((props, ref) => (
	<TabsPrimitive.Trigger ref={ref} className="tab" {...props} />
));
export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuContent = React.forwardRef(
	({ children, ...props }, ref) => (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Content
				ref={ref}
				className="ui-menu"
				sideOffset={6}
				collisionPadding={12}
				{...props}
			>
				{children}
			</MenuPrimitive.Content>
		</MenuPrimitive.Portal>
	),
);
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;
export const DropdownMenuRadioItem = React.forwardRef(
	({ children, ...props }, ref) => (
		<MenuPrimitive.RadioItem ref={ref} className="ui-menu-item" {...props}>
			{children}
			<MenuPrimitive.ItemIndicator className="ui-menu-check">
				<Check size={14} />
			</MenuPrimitive.ItemIndicator>
		</MenuPrimitive.RadioItem>
	),
);
export const DropdownMenuItem = React.forwardRef((props, ref) => (
	<MenuPrimitive.Item ref={ref} className="ui-menu-item" {...props} />
));
export const DropdownMenuLabel = (props) => (
	<MenuPrimitive.Label className="ui-menu-label" {...props} />
);
export const Dialog = DialogPrimitive.Root;
export const DialogContent = React.forwardRef(({ children, ...props }, ref) => (
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay className="ui-overlay" />
		<DialogPrimitive.Content ref={ref} className="ui-dialog" {...props}>
			{children}
			<DialogPrimitive.Close asChild>
				<Button variant="ghost" className="ui-close" aria-label="Close">
					<X size={18} />
				</Button>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
));
export const DialogTitle = (props) => (
	<DialogPrimitive.Title className="ui-dialog-title" {...props} />
);
export const DialogDescription = (props) => (
	<DialogPrimitive.Description className="ui-dialog-description" {...props} />
);
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = React.forwardRef((props, ref) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			ref={ref}
			className="ui-popover"
			sideOffset={8}
			collisionPadding={12}
			{...props}
		/>
	</PopoverPrimitive.Portal>
));
