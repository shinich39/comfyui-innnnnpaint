"use strict";

import { ComfyApp, app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const ImageLoaderClasses =  [
  "LoadImage",
  "LoadImageMask",
  "LoadImage //Inspire",
  "Load image with metadata [Crystools]",
  "Image Load", // was-node-suite-comfyui
];

const ImagePreviewClasses = [
  "PreviewImage", 
  "SaveImage", 
  "LoadImage",
  "LoadImageMask",
  "NothingHappened",
];

let workflows;

function setEditorImage(node) {
  ComfyApp.copyToClipspace(node);
}

function setEditorReturn(node) {
  ComfyApp.clipspace_return_node = node;
}

function openEditor() {
  ComfyApp.open_maskeditor();
}

async function getWorkflows() {
  const response = await api.fetchApi(`/shinich39/comfyui-innnnnpaint/get-workflows`);

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  return await response.json();
}

// async function sendToInput(filePath) {
//   const response = await api.fetchApi(`/shinich39/comfyui-innnnnpaint/send-to-input`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json", },
//     body: JSON.stringify({ path: filePath, dirname: "input", }),
//   });

//   if (response.status !== 200) {
//     throw new Error(response.statusText);
//   }

//   return await response.json();
// }

// function getPathFromPreview(node) {
//   if (node.imgs) {

//     let img;

//     if (typeof node.imageIndex == "number") {

//       // An image is selected so select that
//       img = node.imgs[node.imageIndex];

//     } else if (typeof node.overIndex == "number") {

//       // No image is selected but one is hovered
//       img = node.imgs[node.overIndex];

//     }

//     if (img) {

//       const url = new URL(img.src);

//       let filename = url.searchParams.get("filename");
//       if (filename && filename !== "") {
//         filename = "/" + filename;
//       }

//       let subdir = url.searchParams.get("subfolder");
//       if (subdir && subdir !== "") {
//         subdir = "/" + subdir;
//       }

//       let dir = url.searchParams.get("type");
//       if (dir && dir !== "") {
//         dir = "/" + dir;
//       }

//       return `ComfyUI${dir}${subdir}${filename}`;
//     }
//   }
// }

function connectNodes(outputNode, inputNode, outputName, inputName) {
  if (!outputName) {
    if (outputNode.outputs.length === 1) {
      outputName = outputNode.outputs[0].name;
    } else {
      for (const output of outputNode.outputs) {
        const outputType = output.type;
        for (const input of inputNode.inputs) {
          const inputType = input.type;
          if (outputType === inputType) {
            outputName = output.name;
            inputName = input.name;
            break;
          }
        }
      }
    }
  }

  if (!inputName) {
    inputName = outputName;
  }

  let output = outputName ? outputNode.outputs?.find(e => e.name === outputName) : null;
  let outputSlot;
  let input = inputName ? inputNode.inputs?.find(e => e.name === inputName) : null;
  let inputSlot;

  if (output) {
    outputSlot = outputNode.findOutputSlot(output.name);
    if (!input) {
      input = inputNode.inputs?.find(e => e.type === output.type);
      if (input) {
        inputSlot = inputNode.findInputSlot(input.name);
      }
    }
  }

  if (input) {
    inputSlot = inputNode.findInputSlot(input.name);
    if (!output) {
      output = outputNode.outputs?.find(e => e.type === input.type);
      if (output) {
        outputSlot = outputNode.findOutputSlot(output.name);
      }
    }
  }

  if (typeof inputSlot === "number" && typeof outputSlot === "number") {
    outputNode.connect(outputSlot, inputNode.id, inputSlot);
  }
}

app.registerExtension({
	name: "shinich39.ToInpaint",
  setup() {
    getWorkflows().then((w) => {
      workflows = w.filter((item) => item.data);
      console.log(`[comfyui-innnnnpaint] initialized`);
    });
  },
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (ImagePreviewClasses.indexOf(nodeType.comfyClass || nodeData.name) === -1) {
      return;
    }

    const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      const r = origGetExtraMenuOptions ? origGetExtraMenuOptions.apply(this, arguments) : undefined;

      try {
        const self = this;

        const loadWorkflow = async (workflow) => {

          // load new workflow
          await app.loadGraphData(workflow);
          
          const origImageLoader = app.graph.nodes.find((item) => {
            return ImageLoaderClasses.indexOf(item.type) > -1;
          });

          // load image node already exists
          if (origImageLoader) {

            // return image after mask editing 
            setEditorReturn(origImageLoader);

            return;
          }

          // no load image node
          // emtpy latent image node replace to load image node and vae encode node
          // connect nodes with re-positioning

          const emptyLatent = app.graph.nodes.find((item) => item.type === "EmptyLatentImage");
          if (!emptyLatent) {
            console.error(`[comfyui-innnnnpaint] no EmptyLatentImage node in workflow`);
            return;
          }

          // get position
          const pos = [emptyLatent.pos[0], emptyLatent.pos[1]];

          // get connections
          const links = emptyLatent?.outputs[0]?.links || [];
          const targets = [];
          for (const linkId of links) {
            const link = app.graph.links.get(linkId);
            targets.push({
              id: link.target_id,
              slot: link.target_slot,
            });
          }

          // remove Empty Latent Image
          app.graph.remove(emptyLatent);

          // create Load Image
          const imageLoader = LiteGraph.createNode("LoadImage");
          imageLoader.pos = [pos[0], pos[1]];
          app.canvas.graph.add(imageLoader, false);
          
          // create VAE Encode
          const vaeEncoder = LiteGraph.createNode("VAEEncode");
          vaeEncoder.pos = [
            imageLoader.pos[0] + imageLoader.size[0] + 16,
            imageLoader.pos[1]
          ];
          app.canvas.graph.add(vaeEncoder, false);

          connectNodes(imageLoader, vaeEncoder);

          // return image after mask editing 
          setEditorReturn(imageLoader);

          // connect vaeEncoder with KSampler
          for (const { id, slot } of targets) {
            const target = app.graph.getNodeById(id);
            connectNodes(vaeEncoder, target);
          }

          // connect vae with VAELoader or CheckpointLoaderSimple
          const vaeLoader = app.graph.nodes.find((item) => item.type === "VAELoader");
          if (vaeLoader) {
            
            connectNodes(vaeLoader, vaeEncoder);

          } else {

            const ckptLoader = app.graph.nodes.find((item) => item.type === "CheckpointLoaderSimple");
            if (ckptLoader) {

              connectNodes(ckptLoader, vaeEncoder);

            }

          }
        }

        const workflowOptions = [{
          content: "Current Workflow",
          callback: async () => {
            setEditorImage(self);
            const { workflow } = await app.graphToPrompt();
            loadWorkflow(workflow);
            openEditor();
          }
        }];

        for (const { path, filename, data } of workflows) {
          workflowOptions.push({
            content: filename,
            callback: async () => {
              setEditorImage(self);
              const clone = JSON.parse(JSON.stringify(data));
              loadWorkflow(clone);
              openEditor();
            }
          });
        }

        let optionIndex = options.findIndex((o) => o?.content === "Inputs");
        if (optionIndex < 0) {
          optionIndex = 0;
        }
        
        let newOptions = [
          {
            content: "Inpaint as",
            disabled: workflowOptions.length === 0,
            submenu: {
              options: workflowOptions,
            },
          },
        ];
        
        options.splice(
          optionIndex,
          0,
          ...newOptions
        );
      } catch(err) {
        console.error(err);
      }

      return r;
    } 
  }
});