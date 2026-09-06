import PatientWorkspace from "./components/PatientWorkspace";
import TeamCollaborationDock from "./components/team/TeamCollaborationDock";

export default function Home() {
  return (
    <>
      <PatientWorkspace />
      <TeamCollaborationDock />
    </>
  );
}
