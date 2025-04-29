"""
@author: shinich39
@title: comfyui-innnnnpaint
@nickname: comfyui-innnnnpaint
@version: 1.0.0
@description: Load new workflow after mask editing.
"""

import os
import inspect
import json
import traceback
import time
import shutil

from server import PromptServer
from aiohttp import web

import folder_paths

root_directory = os.path.dirname(inspect.getfile(PromptServer))
workflows_directory = os.path.abspath(os.path.join(folder_paths.get_user_directory(), 'default', 'workflows'))

def get_dir_path(dir_name):
  return os.path.join(root_directory, dir_name)

def get_now():
  return round(time.time() * 1000)

def chk_dir(p):
  if os.path.exists(p) == False:
    os.makedirs(p, exist_ok=True)

def get_workflows():
  files = []

  for dir_path, directories, file in os.walk(workflows_directory):

    for file in file:

      if (file.endswith(".json")):

        file_path = os.path.abspath(
          os.path.join(dir_path, file)
        )

        data = None
        with open(file_path) as f:
          data = json.load(f)

        files.append(
          {
            "path": file_path,
            "filename": file,
            "data": data,
          }
        )

  return files

@PromptServer.instance.routes.get("/shinich39/comfyui-innnnnpaint/get-workflows")
async def _get_workflows(request):
  try:
    return web.json_response(get_workflows())
  except Exception as err:
    print(traceback.format_exc())
    return web.Response(status=400)

@PromptServer.instance.routes.post("/shinich39/comfyui-innnnnpaint/send-to-input")
async def _send_to_input(request):
  try:
    req = await request.json()
    src_path = req["path"]
    dirname = req["dirname"]
    dir_path = get_dir_path(dirname)
    src_name, src_ext = os.path.splitext(src_path)
    dst_name = f"{str(get_now())}{src_ext}"
    dst_path = os.path.join(dir_path, dst_name)

    chk_dir(dir_path)

    shutil.copyfile(src_path, dst_path)

    return web.json_response({
      "path": os.path.relpath(dst_path, dir_path),
      "filename": dst_name,
    })
  except Exception:
    print(traceback.format_exc())
    return web.Response(status=400)

NODE_CLASS_MAPPINGS = {}

NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]