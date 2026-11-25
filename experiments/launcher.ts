import { projectDocuments } from './shared/experiment-documents'

const contentsLink = document.querySelector<HTMLAnchorElement>('#project-contents-link')
if (contentsLink) contentsLink.href = projectDocuments.contents
